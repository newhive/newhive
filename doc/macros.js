// macro e.g.

{
    id:'a099a84f',
    name:'group_6',
    type:'hive.group',
    position:[10, 75.78125],
    z:7,
    macro:{
        args:[
            {name:'a', default:0, type:float},
            {name:'size', default:[3,3], type: list int}
            {name:'obj', default: {
                type:'hive.polygon',
                foo:'...'
            }}
        ],
        body:[
            {key: 'apps'}
        ]
    }
    apps: []
}