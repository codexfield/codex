import { GnfdClient } from "@/config/client";
import { SpResponse } from '@bnb-chain/greenfield-js-sdk';
import { Stat } from 'isomorphic-git';
import localforage from 'localforage';
import { getCheckSums } from '@bnb-chain/greenfiled-file-handle';

type EncodingOpts = {
  encoding?: "utf8";
};

class FileNotFoundError extends Error {
  code: string;

  constructor(message: string) {
    super(message);
    this.name = 'FileNotFoundError';
    this.code = 'ENOENT';
    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}

export default class GnfdBackend {
  private repoName: string;
  private privateKey: string;
  private endpoint: string;
  private forageInstance: LocalForage;
  private address: string;

  constructor(repoName: string, privateKey: string, endpoint: string) {
    this.repoName = repoName
    this.privateKey = privateKey
    this.endpoint = endpoint

    this.address = "0x646903F8653c671F101978569f186fEfC2319F40"
    this.forageInstance = localforage.createInstance({
      name: 'codex',
      storeName: repoName,
    })
  }

  private async saveSuperblock() { }

  private async readGnfdObject(objectName: string) {
    console.log('onGnfdObject', objectName)
    let res: SpResponse<Blob>;

    const cacheObjectRes = await this.forageInstance.getItem(objectName) as SpResponse<Blob>;

    console.log('cacheObjectRes', cacheObjectRes)

    if (cacheObjectRes) {
      res = cacheObjectRes;
    } else {
      res = await GnfdClient.object.getObject({
        bucketName: this.repoName,
        objectName,
        endpoint: this.endpoint,
      }, {
        type: 'ECDSA',
        privateKey: this.privateKey
      })
      console.log('repo', this.repoName, objectName, res)

      await this.forageInstance.setItem(objectName, res)
    }

    return res;
  }

  public async readFile(
    filepath: string,
    opts: EncodingOpts | string
  ): Promise<string | Uint8Array> {
    let objectName: string;
    let type: string = '';
    if (filepath.startsWith("/objects/")) {
      const temp = filepath.slice(1);
      const str = temp.split("/");
      objectName = `objects/${str[1]}${str[2]}`;
    } else if (filepath.startsWith("/packed-refs")) {
      // this.forageInstance.setItem(filepath, '')
      return ''
    } else {
      objectName = filepath.slice(1)
    }

    // console.log('get object', filepath, objectName)

    const res = await this.readGnfdObject(objectName)

    if (!res.body) return '';
    if (filepath.startsWith("/objects/")) {
      return new Uint8Array(await res.body.arrayBuffer())
    } else {
      let resText = await res.body?.text()
      if (resText.endsWith('\n')) {
        return resText.slice(0, -1)
      } else {
        return resText
      }
    }
  }

  private async convertToUint8Array(data: Uint8Array | string): Uint8Array {
    if (typeof data === 'string') {
      return new TextEncoder().encode(data);
    } else {
      return data;
    }
  }
  private async writeGnfdObject(objectName: string, data: Uint8Array | string) {
    console.log('onWriteObject', objectName)
    let hashResult = {} as any

    try {
      hashResult = await (window as any).FileHandle.getCheckSums(
        await this.convertToUint8Array(data)
      );
    } catch (e) {
      console.error(e)
    }

    console.log('hashResult', hashResult)

    const { contentLength, expectCheckSums } = hashResult;
    const createObjectTx = await GnfdClient.object.createObject(
      {
        bucketName: this.repoName,
        objectName: objectName,
        creator: this.address,
        visibility: 'VISIBILITY_TYPE_PRIVATE',
        fileType: "application/octet-stream",
        redundancyType: 'REDUNDANCY_EC_TYPE',
        contentLength,
        expectCheckSums: JSON.parse(expectCheckSums),
      },
      {
        type: 'ECDSA',
        privateKey: this.privateKey
      }
    );

    const simulateInfo = await createObjectTx.simulate({
      denom: 'BNB',
    });

    console.log('simulateInfo', simulateInfo);

    const res = await createObjectTx.broadcast({
      denom: 'BNB',
      gasLimit: Number(simulateInfo?.gasLimit),
      gasPrice: simulateInfo?.gasPrice || '5000000000',
      payer: this.address,
      granter: '',
      privateKey: this.privateKey,
    });

    if (res.code === 0) {
      console.log('createObject tx success')
    } else {
      console.log('create object failed.', res)
    }

    await this.delay(5000)
  
    console.log("data:", data)
    var blob = new Blob([data], { type: 'text/plain' });
    var file = new File([blob], "foo.txt", {type: "text/plain"});
    const uploadRes = await GnfdClient.object.uploadObject(
      {
        bucketName: this.repoName,
        objectName: objectName,
        body: file,
        txnHash: res.transactionHash,
      },
      {
        type: 'ECDSA',
        privateKey: this.privateKey
      }
    );
    console.log('uploadRes', uploadRes);

    return res;
  }

  async delay(time :number) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(0);
      }, time);
    });
  }

  async writeFile(
    filepath: string,
    data: Uint8Array | string,
  ): Promise<void> {
    debugger;
    let objectName: string
    if (filepath.startsWith("/objects/")) {
      const temp = filepath.slice(1);
      const str = temp.split("/")
      objectName = `objects/${str[1]}${str[2]}`;
    } else if (filepath.startsWith("/packed-refs")) {
      return
    } else if (filepath.startsWith("/config")) {
      return
    } else if (filepath.startsWith("/HEAD") || filepath.startsWith("/refs/")) {
      objectName = `refs` + filepath
    } else {
      objectName = filepath.slice(1)
    }

    const res = await this.writeGnfdObject(objectName, data)
  }

  async unlink(filepath: string): Promise<void> {
  }

  async stat(filepath: string): Promise<Stat> {
    try {
      debugger;
      let res: Awaited<ReturnType<typeof GnfdClient.object.headObject>>;

      // const cacheHeadObjRes = await this.forageInstance.getItem(filepath) as Awaited<ReturnType<typeof GnfdClient.object.headObject>>
      const cacheHeadObjRes = false

      if (cacheHeadObjRes) {
        res = cacheHeadObjRes
      } else {
        res = await GnfdClient.object.headObject(this.repoName, filepath.slice(1))
      }

      if (res) {
        return {
          // @ts-ignore
          type: 'file',
          size: res.objectInfo.payloadSize.toNumber()
        }
      }
    } catch (err) {
      // ...
    }
    throw new FileNotFoundError("File not found")
  }
}
