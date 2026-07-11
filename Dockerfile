FROM nginx:alpine

COPY index.html style.css script.js selfie.html selfie.css selfie.js /usr/share/nginx/html/
COPY flynn.jpg jerlens_gate.JPG road1.JPG road2.JPG road3.JPG binyag_frame_transparent.png /usr/share/nginx/html/
COPY gallery/ /usr/share/nginx/html/gallery/
COPY gallery2/ /usr/share/nginx/html/gallery2/

EXPOSE 80
