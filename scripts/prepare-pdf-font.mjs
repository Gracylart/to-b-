import {access,writeFile,mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory=new URL('../dist/assets/pdf/',import.meta.url),target=new URL('NotoSansSC-Regular.ttf',directory);
try{await access(target);}catch{
 await mkdir(directory,{recursive:true});
 const source=new URL('NotoSansSC.ttf',directory);
 const response=await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf');
 if(!response.ok)throw Error(`Cannot download Noto Sans SC: ${response.status}`);
 await writeFile(source,new Uint8Array(await response.arrayBuffer()));
 const root=fileURLToPath(new URL('../',import.meta.url));
 const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:root,stdio:'inherit'});if(r.status!==0)throw Error('PDF font preparation failed');};
 run('python3',['-m','venv','work/font-build']);
 run('work/font-build/bin/pip',['install','fonttools==4.67.0']);
 run('work/font-build/bin/python',['-c',`from fontTools.ttLib import TTFont\nfrom fontTools.varLib.instancer import instantiateVariableFont\nf=TTFont(${JSON.stringify(fileURLToPath(source))})\ninstantiateVariableFont(f,{'wght':400},inplace=True)\nfor t in ['GSUB','GPOS']:\n if t in f: del f[t]\nf.save(${JSON.stringify(fileURLToPath(target))})`]);
 await rm(source);
}
