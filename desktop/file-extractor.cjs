'use strict';
const ipc=require('./process-ipc.cjs');
ipc.onDisconnect(()=>process.exit(0));
const input=JSON.parse(process.argv[2]);
require('./project-files.cjs').excerpt(input).then(result=>ipc.send(result)).catch(error=>ipc.send({error:error.message}));
