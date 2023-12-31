import git, { ReadTreeResult } from '@codexfield/isomorphic-git';
// @ts-ignore
import FS from "@codexfield/lightning-fs"
import { useEffect, useState } from "react"

export const useReadTree = (fs: FS | null, oid: string) => {
  const [tree, setTree] = useState<ReadTreeResult | null>(null);

  useEffect(() => {
    if (!fs || !oid) return;

    const readTree = async () => {
      const tree = await git.readTree({
        fs: fs,
        dir: "",
        gitdir: "",
        oid
      })

      // console.log('tree', tree)

      setTree(tree);
    }

    readTree();

  }, [fs, oid])

  return tree;
}