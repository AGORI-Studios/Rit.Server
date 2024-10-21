#!/bin/bash


echo starting Network server...
node server/node.js &
sleep 2

#if [ `netstat -ltnup udp 2>/dev/null | grep 1337 | wc -l` == 1 ]
if [ true ]
then
  echo running tests...
  node client/javascript-node-js/client.test.js
  EXT=$?
  echo killing Network server...
  jobs -l | awk '{print $2}' | xargs kill -9
  exit $EXT
else
  echo Network not started, tests didnt run
  exit 1
fi
