live_server     = False

plain_port      = 80
ssl_port        = 443
server_name     = 'newhive.com'
dev_prefix      = None
database_host   = 'localhost'
database_port   = 27017
email_port      = 2525
media_path      = '/home/domains/thenewhive.com'
redirect_domains = ['newhive.com', 'thenewhive.com']
live_prefixes   = ['live-2', 'live-3', 'live-4', 'live-5', 'live-6']

analytics_db    = 'analytics'

google_api_key  = 'AIzaSyDwFDcABJN8ldQKGCA2ohiO8kHoFst57X8'
ssl_ca          = False

aws_id          = False
aws_secret      = False
s3_buckets = {
    'media': None,
    'system': None,
    'asset': None,
}
cloudfront_domains = {
    'media': None,
    'asset': None
}


################################################################
# constants
################################################################
cat_hover_count = 6
# use_strict = False

################################################################
# strings
################################################################
str_expression  = 'newhive'

################################################################
admins          = ['abram', 'cara', 'zach', 'newduke', 'fatsycline','root','newhive']

default_email_subscriptions = ['love', 'listen', 'share_expr', 'comment', 'broadcast', 'featured', 'milestone']
milestones = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
              20000, 50000, 100000, 200000, 500000, 1000000, 10000000]

devs = [ 'newduke', 'abram', 'spiffeh', 'nd4' ]

beta_testers = admins + [
    'andrew'
    ,'darkluna'
    ,'philco'
    ,'lolo'
    ,'roseanna'
    ,'anniesarah'
    ,'graham'
    ,'coo'
    ,'ashley'
    ,'ece'
    ,'sammie'
    ,'kaz'
    ,'v908'
    ,'test'
]

user_groups = { 'logged_in':set([]), 'logged_out':set(['logged_out']), 'all':set([]), 
    'admins':set(admins), 'beta_testers':set(beta_testers), 'devs':set(devs) }

site_flags = {

    ## When adding new flags, make comment in issue with flag name!
    # FLAG: foo
    ## And update https://github.com/hivedev/newhive/wiki/Site-flags

    # Features
    'Features': { 
        'description':'Flagged features'
    },'Features/show_hive_all': {
        'description':'Community pages show "Hive All"'
        , 'values':['newduke','nd4']
    },'Features/open_signup': {
        'description':'Allow anyone to sign up'
        , 'values':['all']
    },'Features/show_user_guide': {
        'description':'User guide appears in the "about" menu'
        ,'values':['devs']
    },'Features/merge_recent': {
        'description':'Community pages don\'t have "Network"'
        , 'values':['cara', 'fatsycline']
    },'Features/can_debug': {
        'description':'User receives debug info (like the blue sensitivity debug window in editor)'
        , 'values':['devs']
    },'Features/mobile_web': {
        'description':'Override to force mobile view of site'
        , 'values':['nd4']
    },'Features/user_search': {
        'description':'Return users in search results'
        , 'values':['devs']
    },'Features/categories': {
        'description':'Show category bar in nav'
        , 'values':['devs']
    },'Features/category_hovers': {
        'description':'Show hovers/animations on cards in category views'
        , 'values':['devs']
    },'Features/force_stumble': {
        'description':'Force the stumbleupon logo'
        , 'values':['none']
    },'Features/lazy_loading': {
        'description':'Lazy load various client images' #Load low-res images when initially fetching newhives'
        , 'values':['admins', 'devs']
    },'Features/fade_controls': {
        'description':'Fade bottom icons in newhive view'
        , 'values':['admins', 'devs']

    # Admin
    },'Admin': { 
        'description':'Flags for administering the website'
    },'Admin/admin': {
        'description':'Enable administrative features'
        , 'values':['admins']
    
    # UI    
    },'UI': {
        'description':'Test versions of the UI'
    },'UI/top_card': {
        'description':'Test versions of top card UI'
    },'UI/top_card/do_fade': {
        'description':'Fade instead of scroll'
        , 'values':['all','admins']
    },'UI/top_card/do_overlaps': {
        'description':'Show overlapping regions to left and right'
        , 'values':['all','admins=1']
    },'UI/top_card/do_full_bleed': {
        'description':'Show overlaps exending to window edgdes'
        , 'values':['all','admins=1']
    },'UI/top_card/card_margins': {
        'description':'Margin between scrolling cards (px)'
        , 'values':['all=20','admins=20']
    },'UI/top_card/card_overlaps': {
        'description':'Width of overlapping regions to left and right (px)'
        , 'values':['all=80','admins=80']
    },'UI/top_card/card_opacity': {
        'description':'Opacity of overlapping cards'
        , 'values':['all=.1','admins=.1']
    },'UI/top_card/slide_duration': {
        'description':'Time to complete fade/scroll animation (ms)'
        , 'values':['all=1200','admins=1200']
    },'UI/top_card/flip_time': {
        'description':'Time between card cycling (ms)'
        , 'values':['all=6000','admins=6000']
    },'UI/dim_top_card_hover': {
        'description':'Dim the UI on the top category card during mouseover'
        , 'values':['admins']
    },'UI/expander_arrows': {
        'description':'Show an indication of submenus'
        , 'values':['all=0','admins']
    },'UI/mobile_activity': {
        'description':'Show activity menu under logo on mobile'
        , 'values':['admins','nd4']
    
    # Editor
    },'Editor': { 
        'description':'Flags pertaining to the editor'
    },'Editor/snap_crop': {
        'description':'Allow snapping when shifting crop bounds of cropped images'
        , 'values':['admins','nd4']
    },'Editor/shift_does_raise': {
        'description':'user can shift-click an app to raise, ctrl-shift-click to lower'
        ,'values':['newduke:4','nd4','abram']
    },'Editor/rect_drag_drop': {
        'description':'user can drag images onto rectangles and images'
        , 'values':['admins','nd4']
    },'Editor/modify_special_tags': {
        'description':'user can add and remove "reserved" tags, e.g., "#Gifwall"'
        , 'values':['admins','nd4']
    },'Editor/show_mini_selection_border': {
        'description':'always show the focused selection border (vs only when multiselecting)'
        , 'values':['admins','nd4']
    },'Editor/copy_table': {
        'description':'allow dragging of "duplicate" button to create tables of duplicates'
        , 'values':['admins','nd4']
    },'Editor/button_options': {
        'description':'Show the sharing options UI in editor save dialog.'
        , 'values':['admins','nd4']
    },'Editor/shapes': {
        'description':'Show the shape creation options'
        , 'values':['admins','nd4']
    },'Editor/custom_domain': {
        'description':'Show the custom domain UI in editor save dialog.'
        , 'values':[]
    },'Editor/tile_multiple_images': {
        'description':'Drag and drop multiple images onto rectangle/image/background tiles the images into space the width of the drop target'
        , 'values':['admins','nd4']
    },'Editor/css_classes': {
        'description':'Let user edit the css class of an app'
        , 'values':['admins','devs']
    },'Editor/shape_link': {
        'description':'Allow links and anchors on shape apps'
        , 'values':['admins','devs']
    },'Editor/autoplay': {
        'description':'Show the autoplay and autohide controls on audio apps'
        , 'values':['admins','devs']
    },'Editor/context_help': {
        'description':'Use the "?" for context-sensitive help'
        , 'values':['admins','devs']
    },'Editor/anchor_name': {
        'description':'Show the anchor option for links'
        , 'values':['admins','devs']
    },'Editor/grouping': {
        'description':'Show grouping UI, editor shortcuts'
        , 'values':['admins','devs']
    },'Editor/crop_move_border': {
        'description':'Move the crop region when dragging border'
        , 'values':['admins','all']
    },'Editor/resize_nw': {
        'description':'Show resizers in NW'
        , 'values':['admins','devs']
    },'Editor/resize_all': {
        'description':'Show all resizers'
        , 'values':['admins','devs']
    },'Editor/merge_minis': {
        'description':'Merge the mini selection borders for groups'
        , 'values':['admins','devs']
    }

    # Old / unused
    #,'logged': ['logged_out']

}

site_user = 'newhive'
admins.append(site_user)

content_domain = 'tnh.me'

email_server    = 'localhost'
email_user      = False
email_password  = False

facebook_app_id = ''
facebook_client_secret = ''

#streamified_client_id = 'pjzkv2y4twdsutl3n0mkv1yajv1y5y3e'
#streamified_client_secret = ''
#streamified_networks = ['twitter']
#streamified_url = 'https://streamified.me/api/'

signup_group    = 2

debug_mode      = False
debug_unsecure  = False
webassets_debug = False
always_secure   = False
threaded_dev_server = False
snapshot_async = True

interactive = False

initial_invite_count = 5

from os.path import dirname, join, normpath, abspath
src_home = normpath(abspath(join(dirname(__file__), "../..")))
