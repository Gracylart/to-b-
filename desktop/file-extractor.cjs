'use strict';
const {parentPort,workerData}=require('node:worker_threads');
require('./project-files.cjs').excerpt(workerData).then(result=>parentPort.postMessage(result)).catch(error=>parentPort.postMessage({error:error.message}));
