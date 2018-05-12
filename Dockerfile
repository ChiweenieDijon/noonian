FROM node:carbon

WORKDIR /usr/lib/noonian

RUN apt-get update && apt-get install -y build-essential uuid-runtime && apt-get install -y python
RUN npm install -g bower 

# noonian stuff
COPY . .
RUN npm install
RUN bower install --allow-root -F
RUN cat server/conf/instance/template.js | sed s/\localhost/mongo/g | sed s/\#instance\#/my_instance/g | sed s/\#instanceID\#/`uuidgen`/g | sed s/\#instanceSECRET\#/`uuidgen`/g > server/conf/instance/my_instance.js
EXPOSE 9000
CMD ["node", "server/app.js", "--instance", "my_instance"]
