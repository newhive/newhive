cleaned_exprs = [dfilter(r, ['_id', 'name', 'owner_name', 'title', 'tags', 'text_index'])
	for r in db.Expr.search({'auth':'public'})]