import fs from "fs";
import sharp from "sharp";
import archiver from "archiver";
import archiverZipEncrypted from "archiver-zip-encrypted";
import { Directorys } from "../types";
import { basename } from "path";

export async function decodeImage(
  imageBuffer: Buffer,
  num: number,
  path: string
) {
  if (num > 0) {
    const metadata = await sharp(Buffer.from(imageBuffer)).metadata();
    const height = metadata.height || 0;
    const width = metadata.width || 0;

    if (height < num) {
      await sharp(Buffer.from(imageBuffer)).toFile(path);
      return;
    }

    // 计算余数
    const over = height % num;
    const move = Math.floor(height / num);

    // 创建一个空白的图像缓冲区
    let decodedImageInstance = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    }).webp();
    // 记录切割结果
    const croppeds: { top: number; cropped: Buffer }[] = [];

    // 循环处理每个分块
    for (let i = 0; i < num; i++) {
      // 裁剪高度
      let currentMove = move;
      // 裁剪位置
      let ySrc = height - move * (i + 1) - over;
      // 新位置
      let yDst = move * i;

      if (i === 0) {
        currentMove += over;
      } else {
        yDst += over;
      }

      // 裁剪当前块
      const cropped = await sharp(imageBuffer)
        .extract({ left: 0, top: ySrc, width, height: currentMove })
        .toBuffer();
      croppeds.push({ top: yDst, cropped });

      // 将裁剪的块粘贴到目标位置
    }
    decodedImageInstance = decodedImageInstance.composite(
      croppeds.map((c) => ({ input: c.cropped, top: c.top, left: 0 }))
    );
    await decodedImageInstance.toFile(path);
  } else {
    await sharp(Buffer.from(imageBuffer)).toFile(path);
  }
}

export async function saveImage(imageBuffer: Buffer, path: string) {
  if (!imageBuffer.byteLength) return;
  const buffer = Buffer.from(imageBuffer);
  await sharp(buffer).toFile(path);
}

/**
 * 将目录压缩成 ZIP 文件，并可选附带密码
 * @param directory 要压缩的目录路径
 * @param outputPath 输出的压缩包路径
 * @param password 可选的密码（如果为空，则不加密）
 * @param level 压缩级别，范围 0-9，默认 9
 */
export async function archiverImage(
  directorys: Directorys[],
  outputPath: string,
  password?: string,
  level: number = 9
) {
  // 检查是否注册过
  if (!archiver.isRegisteredFormat("zip-encrypted")) {
    archiver.registerFormat("zip-encrypted", archiverZipEncrypted);
  }

  // 创建输出流
  const output = fs.createWriteStream(outputPath);
  const options: archiver.ArchiverOptions = {
    zlib: { level }, // 压缩级别
  };
  if (password) {
    options["encryptionMethod"] = "aes256"; // 使用 AES-256 加密
    options["password"] = password;
  }
  // 创建压缩实例
  const archive = archiver.create(password ? "zip-encrypted" : "zip", options);

  // 管道输出到文件
  archive.pipe(output);

  // 添加文件夹
  directorys.forEach(({ directory, destpath }) => {
    archive.directory(directory, destpath);
  });

  // 完成压缩
  await archive.finalize();
}

export async function archiverFile(
  path: string,
  outputPath: string,
  password?: string,
  level: number = 9
) {
  // 检查是否注册过
  if (!archiver.isRegisteredFormat("zip-encrypted")) {
    archiver.registerFormat("zip-encrypted", archiverZipEncrypted);
  }

  // 创建输出流
  const output = fs.createWriteStream(outputPath);
  const options: archiver.ArchiverOptions = {
    zlib: { level }, // 压缩级别
  };
  if (password) {
    options["encryptionMethod"] = "aes256"; // 使用 AES-256 加密
    options["password"] = password;
  }
  // 创建压缩实例
  const archive = archiver.create(password ? "zip-encrypted" : "zip", options);

  // 管道输出到文件
  archive.pipe(output);

  // 添加文件夹
  archive.file(path, { name: basename(path) });

  // 完成压缩
  await archive.finalize();
}
