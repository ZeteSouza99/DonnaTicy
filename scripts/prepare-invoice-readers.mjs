import {mkdir,copyFile,cp,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const target=resolve('public/vendor/invoice');
try {
 const pdf=resolve(require.resolve('pdfjs-dist/package.json'),'..');
 const tess=resolve(require.resolve('tesseract.js/package.json'),'..');
 const core=resolve(require.resolve('tesseract.js-core/package.json'),'..');
 const por=resolve(require.resolve('@tesseract.js-data/por/package.json'),'..');
 await mkdir(target,{recursive:true});
 for(const file of ['pdf.mjs','pdf.worker.mjs'])await copyFile(join(pdf,'build',file),join(target,file));
 for(const folder of ['cmaps','standard_fonts'])await cp(join(pdf,folder),join(target,folder),{recursive:true});
 for(const file of ['tesseract.min.js','worker.min.js'])await copyFile(join(tess,'dist',file),join(target,file));
 await mkdir(join(target,'core'),{recursive:true});
 for(const file of await readdir(core))if(/\.wasm(?:\.js)?$/.test(file))await copyFile(join(core,file),join(target,'core',file));
 await mkdir(join(target,'lang'),{recursive:true});
 await copyFile(join(por,'4.0.0_best_int','por.traineddata.gz'),join(target,'lang','por.traineddata.gz'));
 for(const [folder,name]of [[pdf,'PDFJS'],[tess,'TESSERACT'],[core,'CORE'],[por,'POR']]){
   const license=(await readdir(folder)).find(f=>/^licen[sc]e/i.test(f));
   if(license)await copyFile(join(folder,license),join(target,`LICENSE-${name}`));
 }
 console.log('Leitores locais de PDF e fotos preparados.');
}catch(error){
 console.error('Não foi possível preparar os leitores. Execute npm run invoices:setup.',error.code??error.message);
 process.exitCode=1;
}
