import { v5 as uuidv5 } from "uuid";
import { UUID_NAMESPACE } from "../const";

export function genUUID(username: string) {
  return uuidv5(username.toLowerCase(), UUID_NAMESPACE);
}
