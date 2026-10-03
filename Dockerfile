FROM scratch
USER 1001
COPY peerloom /peerloom
EXPOSE 3478/tcp
EXPOSE 3478/udp
EXPOSE 5050
WORKDIR "/"
ENTRYPOINT [ "/peerloom" ]
CMD ["serve"]
