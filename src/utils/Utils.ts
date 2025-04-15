import { statSync, accessSync, constants } from "fs";
import { readdir, stat, rm } from "fs/promises";
import { http, logger, retryCount } from "..";
import { JUMP_URL, URL_LOCATION } from "./Regexp";
import { HTTP } from "koishi";
import { IJMResponse } from "../types/JMClient";
import { JM_CLIENT_URL_LIST, JM_IMAGE_URL_LIST } from "./Const";
import { normalize, parse } from "path";
import { MySqlError } from "../error/mysql.error";
import { OverRetryError } from "../error/overRetry.error";
import { EmptyBufferError } from "../error/emptybuffer.error";

/**
 * 文件是否存在
 * @param path 文件路径
 * @returns 文件是否存在
 */
export function fileExistsAsync(path: string) {
  try {
    accessSync(path, constants.F_OK); // 检查文件是否存在
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
    const stats = statSync(path); // 获取文件信息
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

/**
 * 从github获取最新的JM域名
 * @returns 域名列表
 */
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

/**
 * 限制Promise并发
 * @param promises Promise方法列表
 * @param limit 限制数量
 * @returns Promise结果
 */
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

/**
 * 重试请求，直到遇到特定错误或者次数耗尽
 * @param url 请求地址
 * @param method 请求方法
 * @param config 请求配置
 * @param retryIndex 尝试次数
 * @returns 请求结果
 */
export async function requestWithRetry<T = IJMResponse>(
  url: string,
  method: "GET" | "POST",
  config: HTTP.RequestConfig = {},
  retryIndex: number = 0
) {
  try {
    const res = await http(method, url, config);
    if (
      typeof res.data === "string" &&
      res.data.includes("Could not connect to mysql")
    ) {
      throw new MySqlError();
    }
    return res.data as T;
  } catch (error) {
    if (error instanceof MySqlError) {
      throw new MySqlError();
    } else if (retryIndex < retryCount) {
      logger.info(
        `${url} 请求失败，正在重试... ${retryIndex + 1}/${retryCount}`
      );
      return await requestWithRetry<T>(url, method, config, retryIndex + 1);
    } else {
      throw new OverRetryError(`请求失败，超过最大重试次数: ${url}`);
    }
  }
}

/**
 * 依次使用定义的地址尝试进行请求，遇到特定错误尝试切换下一个
 * @param url 请求地址
 * @param method 请求方法
 * @param config 请求配置
 * @param urlIndex 地址下标，默认从0开始尝试
 * @returns 请求结果
 */
export async function requestWithUrlSwitch<T = IJMResponse>(
  url: string,
  method: "GET" | "POST",
  config: HTTP.RequestConfig = {},
  type: "IMAGE" | "CLIENT" = "CLIENT",
  urlIndex: number = 0
) {
  const list = type === "CLIENT" ? JM_CLIENT_URL_LIST : JM_IMAGE_URL_LIST;
  const urlCount = list.length;
  const url_bak = url;
  if (url.startsWith("/")) {
    url = `https://${list[urlIndex]}${url}`;
  }
  try {
    if (urlIndex < urlCount) {
      const res = await requestWithRetry<T>(url, method, config);
      if (res instanceof ArrayBuffer && res.byteLength === 0) {
        throw new EmptyBufferError();
      }
      return res;
    } else {
      throw new Error("所有域名请求失败");
    }
  } catch (error) {
    const isMysqlError = error instanceof MySqlError;
    const isEmptyBuffer = error instanceof EmptyBufferError;

    if (isMysqlError || isEmptyBuffer) {
      logger.info(`请求失败，尝试切换域名... ${urlIndex + 1}/${urlCount}`);
      return await requestWithUrlSwitch<T>(
        url_bak,
        method,
        config,
        type,
        urlIndex + 1
      );
    }
    throw new Error(error);
  }
}

/**
 * 获取文件名和扩展名
 * @param filePath 文件路径
 * @returns 文件名、扩展名和路径组成的对象 { fileName, ext, dir }
 */
export function getFileInfo(filePath: string) {
  // 通过 normalize 确保文件路径是标准化的，以防路径中存在冗余的部分（如多余的 / 或 \）
  const normalizedPath = normalize(filePath);
  const parsePath = parse(normalizedPath);
  // 使用 extname 获取文件的扩展名，extname 会返回以 . 开头的扩展名，所以使用 slice(1) 去掉点号
  const ext = parsePath.ext.slice(1);
  // 使用 basename 获取文件名，basename 只返回文件的名称部分，忽略路径部分
  const fileName = parsePath.name;
  // 使用 dirname 获取文件路径（不包括文件名）
  const dir = parsePath.dir;
  // 返回文件名和扩展名
  return { fileName, ext, dir };
}

/**
 * 删除路径下 days 之前的文件夹
 * @param path 路径
 * @param days 天数
 */
export async function deleteFewDaysAgoFolders(path: string, days: number) {
  const dirEntries = await readdir(path, {
    withFileTypes: true,
  });
  // 过滤出文件夹类型的条目
  const subfolderNames = dirEntries
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
  // 循环判断所有文件夹
  for (const folder of subfolderNames) {
    // 获取文件夹状态信息
    const s = await stat(`${path}/${folder}`);
    // 提取创建时间
    const creationTime = s.birthtime || s.ctime;
    // 当前时间
    const now = new Date();
    // 计算时间差（毫秒）
    const diffTime = Math.abs(now.getTime() - creationTime.getTime());
    // 转换为天数并取整
    const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
    if (diffDays >= days) {
      rm(`${path}/${folder}`, { recursive: true });
    }
  }
}
