CHECK INSIDE THE FILES FOR CONFIG

to run both

npm install -g pm2
pm2 start ee30.js
pm2 start deleted_sends.js
pm2 list         # see both running
pm2 logs         # see combined logs
pm2 save         # persist across reboots

type !snipe for deleted sends or !menu for commands

run pm2 resurrect to reload ITS NOT PM2 LOAD
