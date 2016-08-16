#!/bin/bash
#Set these NOONIAN_* vars in ~/.bashrc
if [ -n "$NOONIAN_BASE" ]
then
  APP_BASE=$NOONIAN_BASE
else
  APP_BASE=.
fi

if [ -n "$NOONIAN_LOG_DIR" ]
then
  LOG_DIR=$NOONIAN_LOG_DIR
else
  LOG_DIR=.
fi

if [ -n "$NOONIAN_BACKUP_DIR" ]
then
  BKP_DIR=$NOONIAN_BACKUP_DIR
else
  BKP_DIR=.
fi

function show_running {
  cd $APP_BASE
  for pidFile in pid.*; do
    if ps --pid `cat $pidFile` &> /dev/null ; then
      echo $pidFile | sed s/pid.//
    fi
  done
}

function show_instances {
  ls $APP_BASE/server/conf/instance
}

function start_noonian {
  cd $APP_BASE
  echo starting instance $1...
  nohup node server/app.js --instance $1 >> $LOG_DIR/$1.out 2>&1 &
  bash -i -c "tail -f $LOG_DIR/$1.out"
}

function stop_noonian {
  cd $APP_BASE
  if [ -e pid.$1 ]; then
    echo sending sigint to $1
    kill -SIGINT `cat pid.$1`
  else
    echo pid.$1 not found
  fi
}

function edit_config {
  cd $APP_BASE
  vi server/conf/instance/$1.js
}

function new_instance {
  cd $APP_BASE
  cat server/conf/instance/template.js | sed s/\#instance\#/$1/g | sed s/\#instanceID\#/`uuidgen`/g | sed s/\#instanceSECRET\#/`uuidgen`/g > server/conf/instance/$1.js
  vi server/conf/instance/$1.js
}

function watch_log {
  cd $LOG_DIR
  tail -f $1.out
}

function dump_mongo {
  DB=noonian-$1
  OUT_DIR=$BKP_DIR/${DB}_`date +"%m-%d-%y"`
  echo dumping $DB to $OUT_DIR
  mkdir $OUT_DIR
  mongodump --db $DB --out $OUT_DIR && tar -czf $OUT_DIR.tgz -C $OUT_DIR . && rm -rf $OUT_DIR
  if [ $? -eq 0 ]
  then
    rm $BKP_DIR/${DB}_latest.tgz
    ln -s $OUT_DIR.tgz $BKP_DIR/${DB}_latest.tgz
  fi
}

case "$1" in
  status)
    show_running
    ;;
  instances)
    show_instances
    ;;
  start)
    start_noonian $2
    ;;
  stop)
    stop_noonian $2
    ;;
  conf)
    edit_config $2
    ;;
  new)
    new_instance $2
    ;;
  log)
    watch_log $2
    ;;
  dump)
    dump_mongo $2
    ;;
  *)
    echo $"Usage: $0 {status|instances|start|stop|conf|new|log|dump} instance"
    exit 1
esac
