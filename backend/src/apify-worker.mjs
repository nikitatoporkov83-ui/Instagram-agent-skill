/** Standalone Apify service: no Meta app or database required. */
import { handleApify } from './apify.mjs';
export default {
  async fetch(request,env) {
    return await handleApify(request,env) || new Response('Not found',{status:404});
  },
};
