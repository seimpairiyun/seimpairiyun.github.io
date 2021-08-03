//BUG ARRAY
let i_found_BUGs =
    '{ "buglist" : [' +
    '{ "WebApp":"sikka-djp" , "BugName":"Reflected XSS", "Time":"2020", "Info":"" },' +
    '{ "WebApp":"quran.sadar.web.id" , "BugName":"SQL Injection", "Time":"September 2020", "Info":"" },' +
    '{ "WebApp":"portal.sadar.web.id" , "BugName":"Reflected XSS", "Time":"September 2020", "Info":"" },' +
    '{ "WebApp":"portal.sadar.web.id" , "BugName":"Blind SQLi", "Time":"September 2020", "Info":"Login with anything account and read all tables of database" },' +
    '{ "WebApp":"portal.sadar.web.id" , "BugName":"SQL Injection", "Time":"Oktober 2020", "Info":"Read all tables of database" },' +
    '{ "WebApp":"portal.sadar.web.id" , "BugName":"Business Logic Error + IDOR", "Time":"April 2021", "Info":"Admin account takeover" },' +
    '{ "WebApp":"sidjp" , "BugName":"Reflected XSS", "Time":"April 2021", "Info":"Possible to being phising web" },' +
    '{ "WebApp":"lasisonline" , "BugName":"SQL Injection", "Time":"Mei 2021", "Info":"Read all tables of database" },' +
    '{ "WebApp":"lasisonline" , "BugName":"Stored XSS", "Time":"Juni 2021", "Info":"Cookie stealing lead to account takeover" },' +
    '{ "WebApp":"pedulilindungi.id" , "BugName":"Business Logic Error", "Time":"Juni 2021", "Info":"Steal vaccine certificate other people" },' +
    '{ "WebApp":"pedulilindungi.id" , "BugName":"IDOR", "Time":"Juni 2021", "Info":"View vaccine certificate other people" },' +
    '{ "WebApp":"indopremier.com" , "BugName":"Reflected XSS", "Time":"Juli 2021", "Info":"" },' +
    '{ "WebApp":"sikka-djp" , "BugName":"IDOR", "Time":"Juli 2021", "Info":"View presence history other people can lead to SQLi but idk oracle" }' +
    ']}';

