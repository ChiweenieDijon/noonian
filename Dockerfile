FROM node:carbon

# prerequisites
RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv EA312927 \
  && echo "deb http://repo.mongodb.org/apt/debian wheezy/mongodb-org/3.2 main" | tee /etc/apt/sources.list.d/mongodb-org-3.2.list \
  && apt-get update \
  && apt-get install -y mongodb-org --no-install-recommends \
  && apt-get install -y git \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /usr/lib/noonian
RUN npm install -g bower

# noonian stuff
COPY package*.json ./
RUN npm install
RUN bower install
RUN ./noonian.sh new my_instance
EXPOSE 9000
CMD [ "node", "server/app.js -–instance my_instance" ]

# This Dockerfile doesn't need to have an entrypoint and a command
# as Bitbucket Pipelines will overwrite it with a bash script.
