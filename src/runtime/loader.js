/*
    MIT License

    Copyright (c) 2021 Covistra Technologies Inc.

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

import mime from "mime";
import { filter } from "rxjs/operators/index.js";

function extractComponentInfo(entry) {
  const comp = {};
  const segments = entry.path.match(/^(.*)\.(.*?)\.(.*?)$/);
  if (segments && segments.length === 4) {
    comp.categories = segments[1].split("/");
    comp.key = comp.categories.pop();
    comp.stereotype = segments[2];
    comp.lang = segments[3];
    comp.file = entry.path;
  } else {
    const fragments = entry.path.split("/");
    comp.key = fragments.pop().split(".")[0];
    comp.categories = fragments;
    comp.stereotype = "support";
    comp.file = entry.path;
  }
  comp.type = mime.getType(entry.path);
  comp.content = entry.content;
  return comp;
}

export function loader(runtime) {
  runtime.events.pipe(filter(({ key, op }) => key === "bundle:changed" && op === "add")).subscribe(({ bundle, entries }) => {
    entries.map(extractComponentInfo).map(component => runtime.events.next({ key: "component:loaded", component }));
  });

  runtime.events.pipe(filter(({ key, op }) => key === "bundle:changed" && op === "change")).subscribe(({ bundle, entries }) => {
    entries.map(extractComponentInfo).map(component => runtime.events.next({ key: "component:changed", component }));
  });
}
