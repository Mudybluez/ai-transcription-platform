FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

# Создаем папку для временного хранения загруженных файлов
RUN mkdir -p /usr/src/app/uploads

EXPOSE 3002

CMD ["npm", "start"]