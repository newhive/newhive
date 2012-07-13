require 'sass'
require 'compiled.asset_paths'

module HiveAssets
    def asset_url(name, secure = false, tail = '')
        # name comes as a Sass string, and for some bizarre reason it's quoted
        name_fixed = name.to_s().delete('"').delete("'")
        tail_fixed = tail.to_s().delete('"').delete("'")
        
        begin
            p = Paths.fetch(name_fixed)
            if secure:
                p.gsub!('http:', 'https:')
            end
            Sass::Script::String.new('url("'+ p + tail_fixed + '")')
        rescue
            raise ('Asset "'+ name_fixed +'" not found.')
        end
    end
end

module Sass::Script::Functions
  include HiveAssets
end
