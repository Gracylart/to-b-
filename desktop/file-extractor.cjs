'use strict';
process.on('disconnect',()=>process.exit(0));
const input=JSON.parse(process.argv[2]);
require('./project-files.cjs').excerpt(input).then(result=>{if(process.connected)process.send(result,()=>process.exit(0));}).catch(error=>{if(process.connected)process.send({error:error.message},()=>process.exit(1));});
