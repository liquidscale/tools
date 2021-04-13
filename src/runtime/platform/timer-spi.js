export default function (component, runtime) {
  console.log("registering timer", component);

  // retrieve our timer interval spec
  const schedule = runtime.createSchedule(component.schedule);

  // create a schedule in the runtime to trigger our action
  schedule.subscribe(() => component.impl.execute(component.params));
}
