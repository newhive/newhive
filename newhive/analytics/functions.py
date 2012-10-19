import pandas

def user_expression_summary(user, p=False):
    data = [(e['name'], e['views']) for e in user.get_expressions('public')]
    data = data or [('', 0)]
    data = pandas.DataFrame(data, columns=['name', 'views'])
    if p:
        print data.describe()
        print data
    return data
