/**
 * Kaomoji data and picker logic — extracted from FriendsMenu.tsx.
 */

export type KaomojiItem = { text: string };
export type KaomojiCategory = {
  id: string;
  items: KaomojiItem[];
};

export const KAOMOJI_CATEGORIES: KaomojiCategory[] = [
  {
    id: "joy",
    items: [
      { text: "(≧▽≦)" }, { text: "(⌒▽⌒)☆" }, { text: "(*^▽^*)" },
      { text: "(o^▽^o)" }, { text: "＼(＾▽＾)／" }, { text: "(✧ω✧)" },
      { text: "(๑˃ᴗ˂)ﻭ" }, { text: "╰(*´︶*)╯" }, { text: "(✯◡✯)" },
      { text: "ヽ(・∀・)ﾉ" }, { text: "٩(◕‿◕)۶" }, { text: "(☆ω☆)" },
    ],
  },
  {
    id: "love",
    items: [
      { text: "(♡μ_μ)" }, { text: "(*♡∀♡)" }, { text: "(´ ω ♡)" },
      { text: "(≧◡≦) ♡" }, { text: "(´• ω •) ♡" }, { text: "( ´ ▽  ).｡ｏ♡" },
      { text: "(*¯ ³¯*)♡" }, { text: "(っ˘з(˘⌣˘ ) ♡" },
      { text: "( ˘⌣˘)♡(˘⌣˘ )" }, { text: "(♡-_-♡)" },
      { text: "(✿ ♥‿♥)" }, { text: "(/^-^(^ ^*)/ ♡" },
    ],
  },
  {
    id: "sad",
    items: [
      { text: "(╥﹏╥)" }, { text: "(ಥ﹏ಥ)" }, { text: "(T_T)" },
      { text: "(ㄒoㄒ)" }, { text: "(｡•́︿•̀｡)" }, { text: "(っ- ‸ - ς)" },
      { text: "(；⌣̀_⌣́)" }, { text: "(oT-T)尸" }, { text: "(ノ_<。)" },
      { text: "(个_个)" }, { text: "(╥_╥)" }, { text: "(-_-)" },
    ],
  },
  {
    id: "angry",
    items: [
      { text: "(╬ Ò﹏Ó)" }, { text: "(｀Д´)" }, { text: "(＃\\Д´)" },
      { text: "(ꐦ ಠ皿ಠ )" }, { text: "(ಠ_ಠ)" }, { text: "(눈_눈)" },
      { text: "(ง •̀_•́)ง" }, { text: "(╬益´)" }, { text: "ヽ(д´*)ノ" },
      { text: "(凸ಠ益ಠ)凸" }, { text: "(　ﾟДﾟ)＜!!" },
    ],
  },
  {
    id: "shock",
    items: [
      { text: "(O_O)" }, { text: "(ﾟДﾟ;)" }, { text: "(o_O)" },
      { text: "ヽ(°〇°)ﾉ" }, { text: "(⊙_⊙)" }, { text: "(□_□)" },
      { text: "(;;;*_*)" }, { text: "(＞﹏＜)" }, { text: "(〇_ｏ)" },
    ],
  },
  {
    id: "think",
    items: [
      { text: "(￣ω￣;)" }, { text: "(´･_･`)" }, { text: "(・_・;)" },
      { text: "(＠_＠)" }, { text: "(・・;)ゞ" }, { text: "┐('～`; )┌" },
      { text: "(￣～￣;)" }, { text: "(ーー;)" }, { text: "(⇀_⇀)" },
    ],
  },
  {
    id: "shy",
    items: [
      { text: "(⁄ ⁄•⁄ω⁄•⁄ ⁄)" }, { text: "(*^.^*)" }, { text: "(//▽//)" },
      { text: "(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)" }, { text: "(*μ_μ)" },
      { text: "(o-_-o)" }, { text: "(,,>﹏<,,)" },
    ],
  },
  {
    id: "lenny",
    items: [
      { text: "( ͡° ͜ʖ ͡°)" }, { text: "( ಠ ͜ʖಠ)" }, { text: "( ͡~ ͜ʖ ͡°)" },
      { text: "¯\\_(ツ)_/¯" }, { text: "(¬‿¬ )" }, { text: "(￣▽￣)" },
      { text: "( 　ﾟ,_ゝﾟ)" }, { text: "( ˘ ɜ˘) ♬♪♫" },
    ],
  },
  {
    id: "music",
    items: [
      { text: "ヾ(´〇`)ﾉ♪♪♪" }, { text: "ヽ(o´∀`)ﾉ♪♬" },
      { text: "(〜￣▽￣)〜" }, { text: "(ﾉ>ω<)ﾉ :｡･:*:･ﾟ'★" },
      { text: "(∩^o^)⊃━☆゜.*" }, { text: "✧*。ヾ(｡>﹏<｡)ﾉﾞ✧*。" },
    ],
  },
  {
    id: "animals",
    items: [
      { text: "(=^･ｪ･^=)" }, { text: "(=①ω①=)" }, { text: "(＾• ω •＾)" },
      { text: "ʕ •ᴥ• ʔ" }, { text: "ʕ •̀ ω •́ ʔ" }, { text: "V●ᴥ●V" },
      { text: "∪･ω･∪" }, { text: "(・θ・)" }, { text: "＞°）m（°＜" },
      { text: ">゜))))彡" },
    ],
  },
  {
    id: "daily",
    items: [
      { text: "( ˘▽˘)っ♨" }, { text: "(*´▽`)_旦~" }, { text: "(っ˘ڡ˘ς)" },
      { text: "(￣o￣) zzZZ" }, { text: "(－_－) zzZ" }, { text: "(x . x) ~~zzZ" },
    ],
  },
  {
    id: "action",
    items: [
      { text: "( ﾒ ﾛ ´)︻デ═一" }, { text: "O=(_´)q" }, { text: "(ง'̀-'́)ง" },
      { text: "ᕕ( ᐛ )ᕗ" }, { text: "ε=ε=┌( >_<)┘" },
    ],
  },
  {
    id: "tables",
    items: [
      { text: "(╯°□°）╯︵ ┻━┻" }, { text: "(ノಠ益ಠ)ノ彡┻━┻" },
      { text: "(╯ರ ~ ರ)╯︵ ┻━┻" }, { text: "┻━┻ ︵ヽ(\\Д´)ﾉ︵ ┻━┻" },
      { text: "┬─┬ノ( º _ ºノ)" }, { text: "(ヘ･_･)ヘ┳━┳" },
    ],
  },
];
