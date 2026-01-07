import { statSync, accessSync, constants } from "fs";
import { readdir, stat, rm } from "fs/promises";
import { Config } from "..";
import { JUMP_URL, URL_LOCATION } from "./Regexp";
import { HTTP, Logger } from "koishi";
import { IJMResponse, IJMUpdateDomainResponse } from "../types/JMClient";
import {
  JM_API_DOMAIN_SERVER_SECRET,
  JM_API_URL_DOMAIN_SERVER_LIST,
  JM_APP_DATA_SECRET,
  JM_APP_TOKEN_SECRET,
  JM_APP_VERSION,
  JM_CLIENT_URL_LIST,
  JM_IMAGE_URL_LIST,
} from "./Const";
import { normalize, parse } from "path";
import {
  MySqlError,
  OverRetryError,
  EmptyBufferError,
  AllDomainFailedError,
} from "../error";
import { createDecipheriv, createHash, Encoding } from "crypto";

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
  // 这些字符在Windows文件系统是禁止的，或者在Linux Shell中是特殊的、容易引起歧义的
  // <>:"/\|?* - Windows 不允许的字符
  // [](){}!#$&;'` - Linux Shell 特殊字符，以及一些其他可能引起问题的符号
  const forbiddenAndShellSpecialChars = /[<>:"/\\|?*()[\]{}!#$&;'`~]/g;
  // 替换不合法和Shell特殊字符为下划线
  let sanitizedFileName = fileName.replace(forbiddenAndShellSpecialChars, "_");
  // 将一个或多个连续的空白字符（包括空格、制表符等）替换为单个下划线
  sanitizedFileName = sanitizedFileName.replace(/\s+/g, "_");
  // 处理连续的下划线：将多个连续的下划线替换为单个下划线，避免文件名过长或不美观
  sanitizedFileName = sanitizedFileName.replace(/_+/g, "_");
  // 去除文件名开头和结尾的下划线或点，防止文件名以不安全的字符开始或结束
  sanitizedFileName = sanitizedFileName.replace(/^[._]+|[._]+$/g, "");

  // 计算文件名字节长度
  let byteLength = Buffer.byteLength(sanitizedFileName, "utf-8");
  // 如果当前字节数超过最大限制，则循环截断
  while (byteLength > 200) {
    const length = sanitizedFileName.length;
    // 每次从末尾移除一个字符，直到字节数在安全范围内
    sanitizedFileName = sanitizedFileName.substring(0, length - 1);
    byteLength = Buffer.byteLength(sanitizedFileName, "utf8");
  }

  // 确保文件名不为空。如果经过清理后文件名变为空，提供一个默认值
  if (sanitizedFileName.trim() === "") {
    return "untitled_document";
  }

  return sanitizedFileName;
}

/**
 * 从github获取最新的JM域名
 * @returns 域名列表
 */
export async function getDomainFromGithub(http: HTTP) {
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
  http: HTTP,
  pluginsConfig: Config,
  logger: Logger,
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
    } else if (retryIndex < pluginsConfig.retryCount) {
      logger.info(
        `${url} 请求失败，正在重试... ${retryIndex + 1}/${
          pluginsConfig.retryCount
        }`
      );
      return await requestWithRetry<T>(
        url,
        method,
        config,
        http,
        pluginsConfig,
        logger,
        retryIndex + 1
      );
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
  http: HTTP,
  pluginsConfig: Config,
  logger: Logger,
  type: "IMAGE" | "CLIENT" = "CLIENT",
  urlIndex: number = 0,
  isUpdate: boolean = false
) {
  const list = type === "CLIENT" ? JM_CLIENT_URL_LIST : JM_IMAGE_URL_LIST;
  console.log(list);

  const urlCount = list.length;
  const url_bak = url;
  if (url.startsWith("/")) {
    url = `https://${list[urlIndex]}${url}`;
  }
  try {
    if (urlIndex < urlCount) {
      const res = await requestWithRetry<T>(
        url,
        method,
        config,
        http,
        pluginsConfig,
        logger
      );
      if (res instanceof ArrayBuffer && res.byteLength === 0) {
        throw new EmptyBufferError();
      }
      return res;
    } else {
      throw new AllDomainFailedError();
    }
  } catch (error) {
    const isMysqlError = error instanceof MySqlError;
    const isEmptyBuffer = error instanceof EmptyBufferError;
    const isOverRetryError = error instanceof OverRetryError;
    const isAllDomainFailedError = error instanceof AllDomainFailedError;

    if (isMysqlError || isEmptyBuffer || isOverRetryError) {
      logger.info(`请求失败，尝试切换域名... ${urlIndex + 1}/${urlCount}`);
      return await requestWithUrlSwitch<T>(
        url_bak,
        method,
        config,
        http,
        pluginsConfig,
        logger,
        type,
        urlIndex + 1,
        isUpdate
      );
    } else if (isAllDomainFailedError && !isUpdate) {
      logger.info(`请求失败，尝试更新域名...`);
      const res = await updateApiDomain(http, pluginsConfig, logger);
      if (!res) throw new AllDomainFailedError();
      return await requestWithUrlSwitch<T>(
        url_bak,
        method,
        config,
        http,
        pluginsConfig,
        logger,
        type,
        0,
        true
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

export function formatFileName(
  originName: string,
  name: string,
  id: string,
  index?: number
) {
  return originName
    .replaceAll("{{name}}", name)
    .replaceAll("{{id}}", id)
    .replaceAll("{{index}}", index ? `${index}` : "")
    .trim();
}

export function md5Hex(key: string, inputEncoding: Encoding = "utf-8") {
  return createHash("md5").update(key, inputEncoding).digest("hex");
}

/**
 * 解密加密字符串
 * @param timestamp 请求时传递的时间戳
 * @param base64 待解密的字符串
 * @param secret
 * @returns 解密结果，JSON
 */
export function decodeBase64<T = Record<string, unknown>>(
  base64: string,
  timestamp: number | string,
  secret: string = JM_APP_DATA_SECRET
): T {
  const dataB64 = Buffer.from(base64, "base64");

  // 计算密钥
  const md5 = md5Hex(`${timestamp}${secret}`);

  // 32位key
  const key = Buffer.from(md5);
  // 解密
  const decipher = createDecipheriv("aes-256-ecb", key, null);
  // decipher.setAutoPadding(false); // 禁用自动填充处理
  let dataAES = decipher.update(dataB64);
  // 拼接全部
  let decrypted = Buffer.concat([dataAES, decipher.final()]);

  const decodedString = decrypted.toString("utf-8");

  // 3. 移除 padding
  // const paddingLength = dataAES[dataAES.length - 1];
  // const dataWithoutPadding = dataAES.slice(0, dataAES.length - paddingLength);

  // 转换为 UTF-8 字符串并解析 JSON
  return JSON.parse(decodedString);
}

export async function updateApiDomain(
  http: HTTP,
  config: Config,
  logger: Logger
): Promise<boolean> {
  for (const url of JM_API_URL_DOMAIN_SERVER_LIST) {
    try {
      const encodeText = await requestWithRetry<string>(
        url,
        "GET",
        { responseType: "text" },
        http,
        config,
        logger
      );
      const domainJson = decodeBase64<IJMUpdateDomainResponse>(
        encodeText,
        "",
        JM_API_DOMAIN_SERVER_SECRET
      );
      JM_CLIENT_URL_LIST.splice(0, JM_CLIENT_URL_LIST.length);
      JM_CLIENT_URL_LIST.push(...domainJson.Server);
      console.log(domainJson);

      console.log(JM_CLIENT_URL_LIST);

      return true;
    } catch (error) {
      console.log(error);
    }
  }
  return false;
}
