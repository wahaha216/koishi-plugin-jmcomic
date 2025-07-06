# @wahaha216/koishi-plugin-jmcomic

[![npm](https://img.shields.io/npm/v/@wahaha216/koishi-plugin-jmcomic?style=flat-square)](https://www.npmjs.com/package/@wahaha216/koishi-plugin-jmcomic)

下载 JM 漫画，无需 python。

## 使用方式

```tex
jm album xxxxxx
jm album info xxxxxx
jm photo xxxxxx
jm queue
```

可在配置中配置是发送 PDF 还是 ZIP 压缩包，支持加密。

## 更新日志

<details>
<summary>0.2.5</summary>

文件名过长时截断至 200 字节

</details>

<details>
<summary>0.2.4</summary>

1. 调整 debug 日志
2. 修正文化名返回值

</details>

<details>
<summary>0.2.3</summary>

1. 将手动路径拼接替换为 join
2. 健壮文件名序列化，尝试修复部分文件名导致无法创建文件

</details>

<details>
<summary>0.2.2</summary>

高度不足图片分割数时输出原图，尝试规避提取图片高度为 0 的情况

</details>

<details>
<summary>0.2.1</summary>

1. 搜索分页限制
2. 搜索结果分割空行

</details>

<details>
<summary>0.2.0</summary>

1. 简易搜索功能
2. 修复队列丢失 i18n key 的问题

</details>

<details>
<summary>0.1.1</summary>

1. 添加队列时返回队列信息
2. 提取代码

</details>

<details>
<summary>0.1.0</summary>

1. 队列系统
2. 下载并发与解密并发限制
3. 修改配置页面顺序、分类
4. 不再直接暴露变量，改为逐级传递
5. 统一暴露 Error 类
6. 添加域名切换条件

</details>

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

1. 文件名移除前后空格
2. 新增文件发送配置，用于配置文件是以 buffer 读取后发送还是以本地地址的形式发送。docker 中使用 file 形式需要在 bot 实现端同时映射/koishi 目录

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
