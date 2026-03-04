/**
 * Game feature barrel.
 */
export {
  useNewsFeed,
  useHytaleFeed,
  useOnlinePatchHealth,
  useHostServerIpc,
  useVersionGating,
  parseNewsContent,
  NEWS_URL,
} from "./gameHooks";
export type {
  NewsItem,
  NewsFeed,
  HytaleFeedItem,
  NewsContentPart,
} from "./gameHooks";
