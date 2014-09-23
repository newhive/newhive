define(['jslump/when', 'jslump/when/sequence', 'jslump/ctx'],
function (when, sequence, getCtx) {
    'use strict'

    var pluginParts = function(id) {
        var delPos = id.indexOf('!')
        return {
            resourceId: id.substr(delPos + 1),
            // resourceId can be zero length
            pluginId: delPos >= 0 && id.substr(0, delPos)
        }
    }

    function lump(ids, io, parentCtx){
        ids.map(function(id){
            console.log('starting ', id)
            var ctx = getCtx(id, parentCtx)
            sequence([getPlugin, toAmdText, info], ctx)
        })

        function getModule(id){
            var dfd = when.defer()
            parentCtx.require([id], dfd.resolve, dfd.reject)
            return dfd.promise
        }

        function getPlugin(ctx){
            var parts = pluginParts(parentCtx.toAbsId(ctx.absId))
            var dfd = when.defer()
            if(parts.pluginId){
                getModule(parts.pluginId).then(function(plugin){
                    ctx.pluginId = parts.pluginId
                    ctx.resourceId = parts.resourceId
                    ctx.plugin = plugin
                }).then(dfd.resolve, dfd.reject)
            }
            else dfd.resolve(ctx)
            return dfd.promise
        }

        function info(ctx){
            console.log(ctx.absId)
        }

        function toAmdText(ctx){
            console.log('AOEU')
            var plugin, resCfg, pio
            var dfd = when.defer()

            if(ctx.plugin){
                console.log('plugin')
                // grab plugin-specific config, if specified
                if (ctx.pluginId && parentCtx.config.plugins[ctx.pluginId]){
                    resCfg = parentCtx.config.plugins[ctx.pluginId]
                }
                else {
                    resCfg = ctx.config
                }
                console.log(resCfg)
                pio = {
                    write: resolve,
                    read: function (absId, callback, errback) {
                        var url = parentCtx.toUrl(absId)
                        when(io.readFile(url), callback, errback)
                    },
                    error: dfd.reject,
                    warn: (console.warn ? console.warn : console.log).bind(console),
                    info: console.log.bind(console)
                }
                console.log('compiling...')
                plugin.compile(
                    ctx.pluginId,
                    ctx.resourceId,
                    parentCtx.require, pio,
                    resCfg
                )
                console.log('compiled')
            }
            else {
                console.log('not with plugin')
                // get the text of the module
                 when(io.readModule(ctx), resolve, dfd.reject)
            }

            return dfd.promise

            function resolve(val){
                ctx.text = val
                dfd.resolve(ctx)
            }
        }
    }

    return lump
})