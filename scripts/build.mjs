import {mkdir,copyFile,cp,rm,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await rm('dist',{recursive:true,force:true});await mkdir('dist/vendor',{recursive:true});await mkdir('vendor',{recursive:true});
const vendor=[['react/umd/react.production.min.js','react.production.min.js'],['react-dom/umd/react-dom.production.min.js','react-dom.production.min.js'],['@supabase/supabase-js/dist/umd/supabase.js','supabase.js']];
for(const [src,dest] of vendor){await copyFile('node_modules/'+src,'vendor/'+dest);await copyFile('vendor/'+dest,'dist/vendor/'+dest);}
for(const f of ['index.html','config.js','data.js','crm-data.js','crm-ui.js','finance-data.js','finance-ui.js','coach-ui.js','demo-mode.js','styles.css','movementScreen.js','icons.js','ui.js','charts.js','exerciseEditor.js','training.js','app.js','manifest.json','sw.js'])await copyFile(f,'dist/'+f);
await cp('icons','dist/icons',{recursive:true});
const html=await readFile('dist/index.html','utf8');if(/https?:\/\//.test(html.match(/<script src[^>]+>/g)?.join('')||''))throw Error('External runtime script found');
console.log('Static app built. Runtime libraries are bundled locally.');
