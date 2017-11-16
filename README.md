# Noonian

https://noonian.org

Noonian is full-stack Javascript client/server platform for database management and general-purpose web-based development.


## Installation 

### 1. Install Prerequisites

Before proceeding, ensure the following software packages are installed on the machine:

1. [Node.js](https://nodejs.org/en/download/)
2. [MongoDB](https://www.mongodb.com/download-center?jmp=nav#community)
3. [git](https://git-scm.com/downloads)
4. [bower](https://bower.io)


### 2. Clone the project repository

```bash
 git clone https://github.com/ChiweenieDijon/noonian.git
```

### 3. Download project dependencies

```bash
 cd noonian
 npm install
```

*Note: bcrypt and node-gyp may fail during the npm install. Depending on the platform (linux/win/osx) dependencies on native compilers (g++, xcode,...) may be causing the problem.  To see what you might be missing try:

```bash
 npm install --verbose
```
(if you see something like "make: g++: Command not found", you know you need to install g++ on your system)


Finally, download the client-side dependencies using bower:

```bash
 bower install
```


## Configure an instance

You can utilize noonian.sh to generate an instance configuration file from template:

```bash
 ./noonian.sh new my_instance
```

*Note: the script launches vi to show you the newly-generated config; to exit type ":q" and hit enter.

Alternatively, you can manually copy and modify server/conf/instance/template.js to a new file in the same directory.


## Launch

Ensure MongoDB is running, and with 'noonian' as the current working directory, launch 'server/app.js' in node:

```bash
 node server/app.js -–instance my_instance
```


You will see console output messages as the database is bootstrapped, and an admin password is generated and is displayed on the console.  Open a web browser to the following URL and provide the admin credentials.

  http://127.0.0.1:9000/ 


For more information how to configure (listen port, https, DB, ...) see:

  http://noonian.org/#Instance%20Configuration


## License

GNU AFFERO GENERAL PUBLIC LICENSE, Version 3

Copyright (C) 2016  Eugene Lockett  gene@noonian.org

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
