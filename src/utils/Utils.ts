import fs from "fs";
import { http } from "..";
import { JUMP_URL, URL_LOCATION } from "./Regexp";

export function fileExistsAsync(path: string) {
  try {
    fs.accessSync(path, fs.constants.F_OK); // 检查文件是否存在
    return true;
  } catch (err) {
    return false;
  }
}

export async function getDomainFromGithub() {
  const url = "https://jmcmomic.github.io";
  const html = await http.get<string>(url);
  const matchs = html.matchAll(URL_LOCATION);
  const urlList = Array.from(matchs, (m) => `${url}${m[1]}`);
  const jumpList = await Promise.all(
    urlList.map((url) =>
      http
        .get<string>(url, { redirect: "manual" })
        .then((res) => res.match(JUMP_URL)[1])
        .catch(() => undefined)
    )
  );
  return jumpList;
}

export async function limitPromiseAll<T>(
  promises: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const result: T[] = [];
  const executing: Promise<any>[] = [];

  for (const promise of promises) {
    const p = (async () => {
      const res = await promise();
      result.push(res);
    })();

    executing.push(p);

    if (executing.length >= limit) {
      // 等待第一个完成的任务
      await Promise.race(executing);
      // 移除已完成的 Promise
      executing.splice(
        executing.findIndex((task) => task === p),
        1
      );
    }
  }

  // 等待所有剩余的任务完成
  await Promise.all(executing);
  return result;
}
