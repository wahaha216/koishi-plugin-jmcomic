// 通用
export const JM_SCRAMBLE_ID = /var scramble_id = (\d+);/;
export const JM_ID = /^(jm)?\d+$/i;

// Photo
export const JM_PHOTO_NAME_ID = /id="album_photo_(\d+).webp"/g;
export const JM_PHOTO_URL = /data-original="(\S+)"\s+id="(\S+)"/g;
export const JM_PHOTO_ID =
  /<meta property="og:url" content=".*?\/photo\/(\d+)\/?.*?">/;

// Album
export const JM_ALBUM_STR_ID = /<span class="number">禁漫车：(\S+)<\/span>/;
export const JM_ALBUM_NAME =
  /<h1 class="book-name" id="book-name">([\s\S]*?)<\/h1>/;
export const JM_ALBUM_EPISODE_DIV =
  /<div class="episode"[^>]*>([\s\S]*?)<\/div>/;
export const JM_ALBUM_EPISODE_NAME_ID =
  /<a\s+[^>]*?data-album="(\d+)"[^>]*?>[\s\S]*?<li class[^>]*>\s*(第\d+话)\s*(?:[\s\d]*<span[^>]*>[\s\S]*?<\/span>)?\s*<\/li>[\s\S]*?<\/a>/g;
export const JM_ALBUM_PAGE_COUNT = /<span class="pagecount">页数:(\d+)<\/span>/;
export const JM_ALBUM_PUBLIC_DATE = />上架日期 : (\S+)<\/span>/;
export const JM_ALBUM_UPDATE_DATE = />更新日期 : (\S+)<\/span>/;
export const JM_ALBUM_TAGS_SPAN =
  /<span itemprop="genre" data-type="tags">([\s\S]*?)<\/span>/;
export const JM_ALBUM_TAGS = />\s*(\S+)\s*<\/a>/g;
export const JM_ALBUM_WORKS_SPAN =
  /<span itemprop="author" data-type="works">([\s\S]*?)<\/span>/;
export const JM_ALBUM_ACTOR_SPAN =
  /<span itemprop="author" data-type="actor">([\s\S]*?)<\/span>/;
export const JM_ALBUM_AUTHOR_SPAN =
  /<span itemprop="author" data-type="author">([\s\S]*?)<\/span>/;
export const JM_ALBUM_DESCRIPTION =
  /<div class="p-t-5 p-b-5">([\s\S]*?)<\/div>/;
export const JM_ALBUM_LIKES = /<span id="albim_likes_\d+">(\S+)<\/span>/;
export const JM_ALBUM_VIEWS =
  /<span>(\S+)<\/span>[\s\S]*<span>次观看次数<\/span>/;

// 其他
export const URL_LOCATION = /<a\s+[^>]*?href="(\S+)"[^>]*?>地址\d+<\/a>/g;
export const JUMP_URL = /document.location = "(\S+)"<\/script>/;
