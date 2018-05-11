FROM node:carbon

WORKDIR /usr/lib/noonian
RUN npm install -g bower

# noonian stuff
COPY . .
RUN npm install
RUN bower install --allow-root
RUN cat server/conf/instance/template.js | sed s/\#instance\#/$1/g | sed s/\#instanceID\#/`uuidgen`/g | sed s/\#instanceSECRET\#/`uuidgen`/g > server/conf/instance/my_instance.js
EXPOSE 9000
VOLUME ["/data/db"]
CMD ["/bin/bash", "cd /var/lib/noonian && node server/app.js --instance my_instance"]
