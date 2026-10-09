export const fetchLog = [];
   let responder = () => new Blob(["x"]);
   export function __setResponder(fn) { responder = fn; }
   export const api = {
     get: async (url, cfg) => {
       fetchLog.push({ url, responseType: cfg?.responseType });
       return { data: await responder(url) };
     },
   };
