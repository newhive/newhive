/****************************************************************************
** Meta object code from reading C++ file 'CutyCapt.hpp'
**
** Created: Mon Aug 19 17:05:43 2013
**      by: The Qt Meta Object Compiler version 63 (Qt 4.8.1)
**
** WARNING! All changes made in this file will be lost!
*****************************************************************************/

#include "CutyCapt.hpp"
#if !defined(Q_MOC_OUTPUT_REVISION)
#error "The header file 'CutyCapt.hpp' doesn't include <QObject>."
#elif Q_MOC_OUTPUT_REVISION != 63
#error "This file was generated using the moc from 4.8.1. It"
#error "cannot be used with the include files from this version of Qt."
#error "(The moc has changed too much.)"
#endif

QT_BEGIN_MOC_NAMESPACE
static const uint qt_meta_data_CutyPage[] = {

 // content:
       6,       // revision
       0,       // classname
       0,    0, // classinfo
       0,    0, // methods
       0,    0, // properties
       0,    0, // enums/sets
       0,    0, // constructors
       0,       // flags
       0,       // signalCount

       0        // eod
};

static const char qt_meta_stringdata_CutyPage[] = {
    "CutyPage\0"
};

void CutyPage::qt_static_metacall(QObject *_o, QMetaObject::Call _c, int _id, void **_a)
{
    Q_UNUSED(_o);
    Q_UNUSED(_id);
    Q_UNUSED(_c);
    Q_UNUSED(_a);
}

const QMetaObjectExtraData CutyPage::staticMetaObjectExtraData = {
    0,  qt_static_metacall 
};

const QMetaObject CutyPage::staticMetaObject = {
    { &QWebPage::staticMetaObject, qt_meta_stringdata_CutyPage,
      qt_meta_data_CutyPage, &staticMetaObjectExtraData }
};

#ifdef Q_NO_DATA_RELOCATION
const QMetaObject &CutyPage::getStaticMetaObject() { return staticMetaObject; }
#endif //Q_NO_DATA_RELOCATION

const QMetaObject *CutyPage::metaObject() const
{
    return QObject::d_ptr->metaObject ? QObject::d_ptr->metaObject : &staticMetaObject;
}

void *CutyPage::qt_metacast(const char *_clname)
{
    if (!_clname) return 0;
    if (!strcmp(_clname, qt_meta_stringdata_CutyPage))
        return static_cast<void*>(const_cast< CutyPage*>(this));
    return QWebPage::qt_metacast(_clname);
}

int CutyPage::qt_metacall(QMetaObject::Call _c, int _id, void **_a)
{
    _id = QWebPage::qt_metacall(_c, _id, _a);
    if (_id < 0)
        return _id;
    return _id;
}
static const uint qt_meta_data_CutyCapt[] = {

 // content:
       6,       // revision
       0,       // classname
       0,    0, // classinfo
       6,   14, // methods
       0,    0, // properties
       0,    0, // enums/sets
       0,    0, // constructors
       0,       // flags
       0,       // signalCount

 // slots: signature, parameters, type, tag, flags
      13,   10,    9,    9, 0x08,
      36,    9,    9,    9, 0x08,
      61,    9,    9,    9, 0x08,
      93,    9,    9,    9, 0x08,
     103,    9,    9,    9, 0x08,
     126,  113,    9,    9, 0x08,

       0        // eod
};

static const char qt_meta_stringdata_CutyCapt[] = {
    "CutyCapt\0\0ok\0DocumentComplete(bool)\0"
    "InitialLayoutCompleted()\0"
    "JavaScriptWindowObjectCleared()\0"
    "Timeout()\0Delayed()\0reply,errors\0"
    "handleSslErrors(QNetworkReply*,QList<QSslError>)\0"
};

void CutyCapt::qt_static_metacall(QObject *_o, QMetaObject::Call _c, int _id, void **_a)
{
    if (_c == QMetaObject::InvokeMetaMethod) {
        Q_ASSERT(staticMetaObject.cast(_o));
        CutyCapt *_t = static_cast<CutyCapt *>(_o);
        switch (_id) {
        case 0: _t->DocumentComplete((*reinterpret_cast< bool(*)>(_a[1]))); break;
        case 1: _t->InitialLayoutCompleted(); break;
        case 2: _t->JavaScriptWindowObjectCleared(); break;
        case 3: _t->Timeout(); break;
        case 4: _t->Delayed(); break;
        case 5: _t->handleSslErrors((*reinterpret_cast< QNetworkReply*(*)>(_a[1])),(*reinterpret_cast< QList<QSslError>(*)>(_a[2]))); break;
        default: ;
        }
    }
}

const QMetaObjectExtraData CutyCapt::staticMetaObjectExtraData = {
    0,  qt_static_metacall 
};

const QMetaObject CutyCapt::staticMetaObject = {
    { &QObject::staticMetaObject, qt_meta_stringdata_CutyCapt,
      qt_meta_data_CutyCapt, &staticMetaObjectExtraData }
};

#ifdef Q_NO_DATA_RELOCATION
const QMetaObject &CutyCapt::getStaticMetaObject() { return staticMetaObject; }
#endif //Q_NO_DATA_RELOCATION

const QMetaObject *CutyCapt::metaObject() const
{
    return QObject::d_ptr->metaObject ? QObject::d_ptr->metaObject : &staticMetaObject;
}

void *CutyCapt::qt_metacast(const char *_clname)
{
    if (!_clname) return 0;
    if (!strcmp(_clname, qt_meta_stringdata_CutyCapt))
        return static_cast<void*>(const_cast< CutyCapt*>(this));
    return QObject::qt_metacast(_clname);
}

int CutyCapt::qt_metacall(QMetaObject::Call _c, int _id, void **_a)
{
    _id = QObject::qt_metacall(_c, _id, _a);
    if (_id < 0)
        return _id;
    if (_c == QMetaObject::InvokeMetaMethod) {
        if (_id < 6)
            qt_static_metacall(this, _c, _id, _a);
        _id -= 6;
    }
    return _id;
}
QT_END_MOC_NAMESPACE
