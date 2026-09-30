@echo off
set FA_ID=%FS_SELF_APP%
set FA_SECRET=louldlb9L29z1u9bsEO4Of7KsWTcWTNN
node "%~dp0feishu-dsh-watch-teapulse.mjs" >> "%~dp0..\room\teapulse-watch.log" 2>&1
