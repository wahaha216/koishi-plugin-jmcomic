# @wahaha216/koishi-plugin-jmcomic

[![npm](https://img.shields.io/npm/v/@wahaha216/koishi-plugin-jmcomic?style=flat-square)](https://www.npmjs.com/package/@wahaha216/koishi-plugin-jmcomic)

下载 JM 漫画，无需 python。

## 使用方式

```tex
jm album xxxxxx
jm album info xxxxxx
jm photo xxxxxx
```

可在配置中配置是发送 PDF 还是 ZIP 压缩包，支持加密。

## 更新日志

<details>
<summary>0.0.6</summary>
添加了一些错误提示
</details>

<details>
<summary>0.0.5</summary>
修改使用示例
</details>

<details>
<summary>0.0.4</summary>
1.文件名移除前后空格

2.新增文件发送配置，用于配置文件是以 buffer 读取后发送还是以本地地址的形式发送。docker 中使用 file 形式需要在 bot 实现端同时映射/koishi 目录

</details>

<details>
<summary>0.0.3</summary>
忘了给自动删除做判断
</details>

<details>
<summary>0.0.2</summary>
依赖从peerDependencies移动到dependencies
</details>

<details>
<summary>0.0.1</summary>
初版
</details>
