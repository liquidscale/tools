export default function (config, runtime) {
  console.log("instantiating redis transport", config, runtime);
  return {
    connect() {
      console.log("connecting this runtime to redis transport");
    },
    publish(publication) {},
    subscribe(subscriptions) {},
  };
}
