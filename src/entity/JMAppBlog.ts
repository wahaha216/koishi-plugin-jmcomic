import { JMBlogAbstract } from "../abstract/JMBlogAbstract";
import { IJMBlog } from "../types/JMClient";

export class JMAppBlog extends JMBlogAbstract {
  constructor(json: IJMBlog) {
    super();
    for (const key in json) {
      if (Object.prototype.hasOwnProperty.call(this, key)) {
        this[key] = json[key];
      }
    }
  }

  static fromJson(json: IJMBlog) {
    return new JMAppBlog(json);
  }
}
