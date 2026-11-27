import { localRequest } from '../gpu/bridge.js';

export function savedBridge(store) {
  function attach(server) {
    server.httpServer?.once('close',()=>store.close());
    server.middlewares.use(async (req,res,next) => {
      // Never expose archive files through Vite's ordinary static-file routes.
      let pathname;
      try { pathname=decodeURIComponent(req.url.split('?')[0]).replaceAll('\\','/'); } catch { res.writeHead(400);return res.end(); }
      if (/(^|\/)saved(\/|$)/i.test(pathname) && !pathname.startsWith('/api/saved/')) { res.writeHead(403);return res.end('Private archive'); }
      if (!req.url.startsWith('/api/saved/')) return next();
      const reply = (status,data) => { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data)); };
      if (!localRequest(req)) return reply(403,{error:'Only same-origin local requests are allowed.'});
      try {
        const url = new URL(req.url,'http://localhost');
        if (url.pathname === '/api/saved/run-totals' && req.method === 'GET') return reply(200,store.runTotals(url.searchParams.get('id')));
        if (url.pathname === '/api/saved/list' && req.method === 'GET') return reply(200,store.list(Object.fromEntries(url.searchParams)));
        if (url.pathname === '/api/saved/batches' && req.method === 'GET') return reply(200,{batches:store.listBatches()});
        if (req.method !== 'POST') return reply(405,{error:'Method not allowed.'});
        let body='',length=0;req.setEncoding('utf8');
        for await (const chunk of req) { length+=Buffer.byteLength(chunk);if(length>110000000)throw new Error('Request too large.');body+=chunk; }
        const data=JSON.parse(body);
        if (url.pathname === '/api/saved/run-progress') { store.recordRun({...data,source:'cpu'}); return reply(200,store.runTotals(data.id)); }
        if (url.pathname === '/api/saved/collect') return reply(200,store.save(data.wallets,data.batchId));
        if (url.pathname === '/api/saved/import-start') return reply(200,store.beginImport(data.filename));
        if (url.pathname === '/api/saved/import-finish') return reply(200,store.finishImport(data.id,data.status));
        if (url.pathname === '/api/saved/delete-wallet') return reply(200,store.deleteWallet(data.id));
        if (url.pathname === '/api/saved/delete-batch') return reply(200,store.deleteBatch(data.id));
        if (url.pathname === '/api/saved/reveal') return reply(200,{wallet:store.get(data.id)});
        if (url.pathname === '/api/saved/export') return reply(200,await store.exportFile(data));
        reply(404,{error:'Unknown saved collection endpoint.'});
      } catch { reply(400,{error:'Saved collection request failed. Check the selection and available disk space.'}); }
    });
  }
  return {name:'xa-wallet-generator-saved',configureServer:attach,configurePreviewServer:attach};
}
