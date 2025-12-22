export const buildHtmlContent = (base64Images: string[]) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        margin: 0;
        padding: 0;
      }
      img {
        display: block;
        width: 100%;
        height: 100vh; /* 每张图片占满一页高度 */
        object-fit: contain; /* 保持图片比例 */
        page-break-after: always; /* 确保每张图片单独一页 */
      }
      img:last-child {
        page-break-after: auto;
      }
    </style>
  </head>
  <body>
    ${base64Images
      .map((base64) => `<img src="${base64}" alt="Image">`)
      .join("\n")}
  </body>
  </html>
`;

export const JM_CLIENT_URL_LIST = [
  "www.cdnaspa.vip",
  "www.cdnaspa.club",
  "www.cdnplaystation6.vip",
  "www.cdnplaystation6.cc",
];

export const JM_IMAGE_URL_LIST = [
  "cdn-msp.jmapiproxy1.cc",
  "cdn-msp.jmapiproxy2.cc",
  "cdn-msp2.jmapiproxy2.cc",
  "cdn-msp3.jmapiproxy2.cc",
  "cdn-msp.jmapinodeudzn.net",
  "cdn-msp3.jmapinodeudzn.net",
];
