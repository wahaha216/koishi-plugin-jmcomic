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
