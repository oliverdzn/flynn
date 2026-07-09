FROM nginx:alpine

COPY index.html style.css script.js /usr/share/nginx/html/
COPY flynn.jpg jerlens_gate.JPG road1.JPG road2.JPG road3.JPG /usr/share/nginx/html/

EXPOSE 80
