export interface IJMResponse {
  code: number;
  data: string;
}

export interface IJMUser {
  uid: string;
  username: string;
  email: string;
  emailverified: "yes" | "no";
  photo: "nopic-Male.gif?v=0" | string;
  fname: string;
  gender: "Male" | "Female";
  message: string;
  coin: string;
  album_favorites: number;
  s: string;
  level_name: "静默的石头" | string;
  level: number;
  nextLevelExp: number;
  exp: string;
  expPercent: number;
  badges: string[];
  album_favorites_max: number;
  ad_free: boolean;
  ad_free_before: string;
  charge: string;
  jar: string;
  invitation_qrcode: string;
  invitation_url: string;
  invited_cnt: string;
  jwttoken: string;
}

export interface IJMAlbumSeries {
  id: string;
  name: string;
  sort: string;
}

export interface IJMAlbumRelated {
  id: string;
  author: string;
  name: string;
  image: string;
}

export interface IJMAlbum {
  id: number;
  name: string;
  images: string[];
  addtime: string;
  description: string;
  total_views: string;
  likes: string;
  series: IJMAlbumSeries[];
  series_id: string;
  comment_total: string;
  author: string[];
  tags: string[];
  works: string[];
  actors: string[];
  related_list: IJMAlbumRelated[];
  liked: boolean;
  is_favorite: boolean;
  is_aids: boolean;
  price: string;
  purchased: string;
}

export interface IJMPhoto {
  id: number;
  series: string[];
  tags: string;
  name: string;
  images: string[];
  image_ids: string[];
  addtime: string;
  series_id: string;
  is_favorite: boolean;
  liked: boolean;
  scramble_id: number;
}
