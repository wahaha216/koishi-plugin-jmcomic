import fs from "fs";
import { http, logger, retryCount } from "..";
import { JUMP_URL, URL_LOCATION } from "./Regexp";
import { HTTP } from "koishi";
import { IJMResponse } from "../types/JMClient";
import { JM_CLIENT_URL_LIST } from "./Const";

/**
 * 文件是否存在
 * @param path 文件路径
 * @returns 文件是否存在
 */
export function fileExistsAsync(path: string) {
  try {
    fs.accessSync(path, fs.constants.F_OK); // 检查文件是否存在
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 获取文件大小
 * @param path 文件路径
 * @returns 文件大小
 */
export function fileSizeAsync(path: string) {
  try {
    const stats = fs.statSync(path); // 获取文件信息
    return stats.size; // 返回文件大小
  } catch (err) {
    return 0;
  }
}

/**
 * 文件名合法化
 * @param fileName 文件名
 * @returns 合法化后的文件名
 */
export function sanitizeFileName(fileName: string) {
  // Windows 不允许的字符
  const forbiddenChars = /[<>:"/\\|?*]/g;
  // 替换不合法字符为下划线
  fileName = fileName.replace(forbiddenChars, "_");
  // 替换其他特殊字符（比如空格）为下划线
  fileName = fileName.replace(/\s+/g, "_");
  // 去除文件名末尾的空格或句点
  fileName = fileName.replace(/[. ]+$/, "");
  // 确保文件名长度不超过 Windows 最大文件名长度
  // const maxLength = 255; // Windows 文件名最大长度
  // if (fileName.length > maxLength) {
  //   fileName = fileName.slice(0, maxLength);
  // }
  return fileName;
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
  const results: T[] = new Array(promises.length);
  const executing: Promise<void>[] = [];

  for (let i = 0; i < promises.length; i++) {
    const promiseFn = promises[i];
    while (executing.length >= limit) {
      await Promise.race(executing);
    }

    const p = promiseFn()
      .then((res) => {
        results[i] = res; // 按索引存储结果
      })
      .finally(() => {
        const index = executing.indexOf(p);
        if (index !== -1) {
          executing.splice(index, 1);
        }
      });

    executing.push(p);
  }

  await Promise.all(executing);
  return results as T[];
}

export async function requestWithRetry<T = IJMResponse>(
  url: string,
  method: "GET" | "POST",
  config: HTTP.RequestConfig,
  retryIndex: number = 0
) {
  try {
    const res = await http(method, url, config);
    if (
      typeof res.data === "string" &&
      res.data.includes("Could not connect to mysql")
    ) {
      throw new Error("Could not connect to mysql");
    }
    return res.data as T;
  } catch (error) {
    if (error.message.includes("Could not")) {
      throw new Error("Could not connect to mysql");
    } else if (retryIndex < retryCount) {
      logger.info(
        `${url} 请求失败，正在重试... ${retryIndex + 1}/${retryCount}`
      );
      return await requestWithRetry<T>(url, method, config, retryIndex + 1);
    } else {
      throw new Error(`请求失败，超过最大重试次数: ${url}`);
    }
  }
}

export async function requestWithUrlSwitch<T = IJMResponse>(
  url: string,
  method: "GET" | "POST",
  config: HTTP.RequestConfig,
  urlIndex: number = 0
) {
  logger.info(`请求地址: ${url}`);
  const urlCount = JM_CLIENT_URL_LIST.length;
  const url_bak = url;
  if (url.startsWith("/")) {
    url = `https://${JM_CLIENT_URL_LIST[urlIndex]}${url}`;
    try {
      if (urlIndex < urlCount) {
        return await requestWithRetry<T>(url, method, config);
      } else {
        throw new Error("所有域名请求失败");
      }
    } catch (error) {
      const isError = error instanceof Error;
      const isMysqlError =
        isError && error.message.includes("Could not connect to mysql");

      if (isMysqlError) {
        logger.info(`请求失败，尝试切换域名... ${urlIndex + 1}/${urlCount}`);
        return await requestWithUrlSwitch<T>(
          url_bak,
          method,
          config,
          urlIndex + 1
        );
      }
      throw new Error(error);
    }
  } else {
    return await requestWithRetry<T>(url, method, config);
  }
}
