import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createWorkspace}=require('../desktop/pdf-workspace.cjs');
const {PDFDocument,PDFName}=require('pdf-lib');
test('PDF comments retain original pages; revisions persist separately and unresolved facts remain',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'review-pdf-'));
 try{const w=createWorkspace(dir),r=await w.sample();assert.equal(r.issues,4);
 const original=await readFile(await w.resolvePDF(r.id,'original.pdf'));
 const annotated=await PDFDocument.load(await readFile(await w.resolvePDF(r.id,'annotated.pdf')));
 assert.equal(annotated.getPageCount(),1);assert.equal(annotated.getPage(0).node.Annots().size(),4);
 const annot=annotated.context.lookup(annotated.getPage(0).node.Annots().get(0));assert.equal(annot.get(PDFName.of('Subtype')).toString(),'/Highlight');
 const revised=await w.revise(r.id,{mode:'demo'});assert.equal(revised.revisions[0].applied.length,3);assert.equal(revised.revisions[0].unresolved,1);
 assert.deepEqual(await readFile(await w.resolvePDF(r.id,'original.pdf')),original);
 assert.equal((await createWorkspace(dir).list())[0].revisions.length,1);
 await assert.rejects(w.resolvePDF(r.id,'../../secrets'),/无效版本/);
 await assert.rejects(w.resolvePDF('../bad','original.pdf'),/无效文件/);
 await assert.rejects(w.revise(r.id,{mode:'remote',endpoint:'http://example.com',model:'test',key:'test'}),/HTTPS/);
 const real=await w.ingest(original,'real.pdf');await assert.rejects(w.revise(real.id,{mode:'demo'}),/仅用于示例/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
