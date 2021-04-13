/**
 * Feeds are external data sources that are pushing their records to LQS. They can be mounted in scopes, but they cannot have actions
 * directly applied to them. For example, legacy data sources like databases, RSS feeds, file folder, etc can be represented as feeds
 * in your LQS system.
 */
export default function (component, runtime) {
  console.log("registering feed", component);
}
