from locust import HttpLocust, TaskSet, task

class UserBehavior(TaskSet):
    def on_start(self):
        """ on_start is called when a Locust start before any task is scheduled """
        self.login()

    def login(self):
        pass
        #self.client.post("/login", {"username":"ellen_key", "password":"education"})

    @task(0)
    def page1(self):
        self.client.get("/abram")

    @task(1)
    def index(self):
        self.client.get("/")

    @task(2)
    def index(self):
        self.client.get("/okoyono/new-hive-virginity?q=blah")

    @task(3)
    def index(self):
        self.client.get("/qualiatik/a-f-a-r")
        

class WebsiteUser(HttpLocust):
    task_set = UserBehavior
    min_wait=5000
    max_wait=9000
