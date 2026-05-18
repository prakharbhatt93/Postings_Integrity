
docker ps -q | xargs -r docker stop

docker ps -aq | xargs -r docker rm -f

docker images -q | xargs -r docker rmi -f
docker volume ls -q | xargs -r docker volume rm -f

docker network ls -q | xargs -r docker network rm 2>/dev/null

docker system prune -af --volumes

docker ps -a
docker images
docker volume ls
docker network ls
