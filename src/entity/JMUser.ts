import { IJMUser } from "../types/JMClient";

export class JMUser {
  private uid: string;
  private username: string;
  private email: string;
  private emailverified: "yes" | "no";
  private photo: "nopic-Male.gif?v=0" | string;
  private fname: string;
  private gender: "Male" | "Female";
  private message: string;
  private coin: string;
  private album_favorites: number;
  private s: string;
  private level_name: "静默的石头" | string;
  private level: number;
  private nextLevelExp: number;
  private exp: string;
  private expPercent: number;
  private badges: string[];
  private album_favorites_max: number;
  private ad_free: boolean;
  private ad_free_before: string;
  private charge: string;
  private jar: string;
  private invitation_qrcode: string;
  private invitation_url: string;
  private invited_cnt: string;
  private jwttoken: string;

  constructor(info: IJMUser) {
    for (const key in Object.keys(info)) {
      if (Object.prototype.hasOwnProperty.call(this, key)) {
        this[key] = info[key];
      }
    }
  }
}
