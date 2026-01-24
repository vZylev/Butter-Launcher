import { twMerge } from "tailwind-merge";

export default function cn(...args: any[]) {
  return twMerge(args);
}
